import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 (check-flink/1.0; +https://link.ityr.xyz/bot)",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Connection": "keep-alive",
  "X-Check-Flink": "1.0"
};

const SOURCE_HEADERS = {
  "Accept": "application/json",
  "Referer": "https://link.ityr.xyz/",
  "Origin": "https://link.ityr.xyz",
  "Accept-Language": "zh-CN,zh;q=0.9",
  "sec-ch-ua": "\"Chromium\";v=\"122\", \"Not(A:Brand\";v=\"24\", \"Google Chrome\";v=\"122\"",
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": "\"Windows\"",
  "X-Check-Flink": "1.0"
};

const SOURCE_URL = 'https://www.xrbk.cn/api/links.json';
const OUTPUT_DIR = './output';

// 辅助函数：格式化为上海时间
function formatShanghaiTime(date) {
  const shanghaiDate = new Date(date);
  shanghaiDate.setHours(shanghaiDate.getHours() + 8);
  
  const year = shanghaiDate.getFullYear();
  const month = String(shanghaiDate.getMonth() + 1).padStart(2, '0');
  const day = String(shanghaiDate.getDate()).padStart(2, '0');
  const hours = String(shanghaiDate.getHours()).padStart(2, '0');
  const minutes = String(shanghaiDate.getMinutes()).padStart(2, '0');
  const seconds = String(shanghaiDate.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

async function fetchSourceLinks() {
  try {
    const response = await fetch(SOURCE_URL, {
      headers: SOURCE_HEADERS,
      redirect: 'follow'
    });
    
    if (!response.ok) {
      throw new Error(`获取源数据失败: HTTP ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`fetchSourceLinks 错误: ${error.message}`);
    throw new Error(`获取源数据失败: ${error.message}`);
  }
}

async function checkLinkDirectly(url) {
  try {
    const startTime = Date.now();
    const response = await fetch(url, {
      headers: HEADERS,
      redirect: 'follow'
    });
    const latency = Math.round((Date.now() - startTime) / 10) / 100;
    
    return {
      success: response.status === 200,
      latency: response.status === 200 ? latency : -1,
      status: response.status
    };
  } catch (error) {
    console.error(`checkLinkDirectly 错误 (${url}): ${error.message}`);
    return {
      success: false,
      latency: -1,
      status: 0,
      error: error.message
    };
  }
}

// 添加并发控制函数
async function batchProcess(items, batchSize, processor) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, 200)); // 批次间延迟
    }
  }
  return results;
}

async function checkWithAPI(items) {
  const results = [];
  const xiaoxiaoStatus = {};
  
  const batchSize = 10;
  const processItem = async (item) => {
    const url = item.link;
    if (!url) {
      return {
        ...item,
        success: false,
        latency: -1,
        needDirectCheck: true
      };
    }

    try {
      const apiUrl = `https://v2.xxapi.cn/api/status?url=${encodeURIComponent(url)}`;
      const response = await fetch(apiUrl, {
        headers: SOURCE_HEADERS,
        timeout: 30000
      });

      if (response.ok) {
        const data = await response.json();
        const statusCode = parseInt(data.data);
        const success = parseInt(data.code) === 200 && (statusCode >= 200 && statusCode < 400);
        
        xiaoxiaoStatus[url] = {
          success,
          status: statusCode,
          apiStatus: parseInt(data.code),
          latency: success ? (data.latency || 0) : -1,
          timestamp: formatShanghaiTime(new Date())
        };

        // 如果API返回的状态码不是2xx或3xx，需要直接检查
        const needDirectCheck = !success;

        return {
          ...item,
          success,
          latency: success ? (data.latency || 0) : -1,
          needDirectCheck
        };
      } else {
        xiaoxiaoStatus[url] = {
          success: false,
          status: 0,
          apiStatus: response.status,
          latency: -1,
          timestamp: formatShanghaiTime(new Date())
        };
        
        return {
          ...item,
          success: false,
          latency: -1,
          needDirectCheck: true
        };
      }
    } catch (error) {
      console.error(`checkWithAPI 错误 (${url}): ${error.message}`);
      xiaoxiaoStatus[url] = {
        success: false,
        status: 0,
        apiStatus: 0,
        latency: -1,
        error: error.message,
        timestamp: formatShanghaiTime(new Date())
      };
      
      return {
        ...item,
        success: false,
        latency: -1,
        needDirectCheck: true
      };
    }
  };

  const processedResults = await batchProcess(items, batchSize, processItem);
  results.push(...processedResults);
  
  return { results, xiaoxiaoStatus };
}

async function checkAllLinks() {
  try {
    const sourceData = await fetchSourceLinks();
    
    // 适配新的JSON结构：从friends数组获取数据，并转换为对象格式
    if (!sourceData || !sourceData.friends || !Array.isArray(sourceData.friends)) {
      throw new Error('源数据格式错误，未找到friends数组');
    }

    // 将friends数组转换为对象数组：{ name, link, favicon }
    const linksToCheck = sourceData.friends.map(friend => ({
      name: friend[0],       // 名称在数组第一个位置
      link: friend[1],       // 链接在数组第二个位置
      favicon: friend[2]     // 图标URL在数组第三个位置
    }));

    const cfStatus = {};
    
    // 先用小小API检查所有链接
    const { results: apiResults, xiaoxiaoStatus } = await checkWithAPI(linksToCheck);
    
    // 找出需要直接检查的链接
    const needDirectCheck = apiResults.filter(item => item.needDirectCheck);
    
    // 直接检查需要检查的链接
    const batchSize = 10;
    const processDirectCheck = async (item) => {
      const result = await checkLinkDirectly(item.link);
      cfStatus[item.link] = {
        success: result.success,
        status: result.status,
        latency: result.latency,
        error: result.error,
        timestamp: formatShanghaiTime(new Date())
      };

      return {
        name: item.name,
        link: item.link,
        favicon: item.favicon,  // 保留favicon信息
        latency: result.latency,
        success: result.success
      };
    };

    const directResults = needDirectCheck.length > 0 
      ? await batchProcess(needDirectCheck, batchSize, processDirectCheck)
      : [];

    // 合并结果
    const finalResults = apiResults.map(item => {
      if (!item.needDirectCheck) {
        // 使用小小API的结果
        return {
          name: item.name,
          link: item.link,
          favicon: item.favicon,  // 保留favicon信息
          latency: item.latency,
          success: item.success
        };
      } else {
        // 使用直接检查的结果
        const directResult = directResults.find(r => r.link === item.link);
        if (directResult) {
          return {
            name: item.name,
            link: item.link,
            favicon: item.favicon,  // 保留favicon信息
            latency: directResult.latency,
            success: directResult.success
          };
        }
        // 如果都失败了
        return {
          name: item.name,
          link: item.link,
          favicon: item.favicon,  // 保留favicon信息
          latency: -1,
          success: false
        };
      }
    });

    const now = new Date();

    const accessible = finalResults.filter(r => r.success).length;
    const resultData = {
      timestamp: formatShanghaiTime(now),
      accessible_count: accessible,
      inaccessible_count: finalResults.length - accessible,
      total_count: finalResults.length,
      link_status: finalResults
    };
    
    return { resultData, cfStatus, xiaoxiaoStatus };
  } catch (error) {
    console.error(`checkAllLinks 错误: ${error.message}`);
    throw error;
  }
}

async function ensureOutputDir() {
  try {
    await fs.access(OUTPUT_DIR);
  } catch {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
  }
}

async function saveResults() {
  try {
    await ensureOutputDir();
    
    console.log('开始检测友情链接...');
    const { resultData, cfStatus, xiaoxiaoStatus } = await checkAllLinks();
    
    // 保存主要状态数据
    await fs.writeFile(
      path.join(OUTPUT_DIR, 'status.json'),
      JSON.stringify(resultData, null, 2),
      'utf8'
    );
    
    // 保存CF检测状态
    await fs.writeFile(
      path.join(OUTPUT_DIR, 'status-cf.json'),
      JSON.stringify(cfStatus, null, 2),
      'utf8'
    );
    
    // 保存小小API检测状态
    await fs.writeFile(
      path.join(OUTPUT_DIR, 'status-xiaoxiao.json'),
      JSON.stringify(xiaoxiaoStatus, null, 2),
      'utf8'
    );
    
    console.log('检测完成！结果已保存到output文件夹');
    console.log(`可访问链接: ${resultData.accessible_count}`);
    console.log(`不可访问链接: ${resultData.inaccessible_count}`);
    console.log(`总链接数: ${resultData.total_count}`);
    
  } catch (error) {
    console.error('保存结果时出错:', error);
    process.exit(1);
  }
}

// 如果直接运行此文件，则执行检测
if (import.meta.url === `file://${process.argv[1]}`) {
  saveResults();
}