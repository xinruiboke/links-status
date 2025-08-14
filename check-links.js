import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';

// 加载配置文件
async function loadConfig() {
  try {
    const configFile = await fs.readFile('config.yml', 'utf8');
    return yaml.load(configFile);
  } catch (error) {
    console.error('❌ 读取配置文件失败:', error.message);
    process.exit(1);
  }
}

// 全局配置变量
let CONFIG = null;

// 辅助函数：格式化为上海时间
function formatShanghaiTime(date) {
  const shanghaiDate = new Date(date);
  shanghaiDate.setHours(shanghaiDate.getHours() + CONFIG.timezone.offset);
  
  const year = shanghaiDate.getFullYear();
  const month = String(shanghaiDate.getMonth() + 1).padStart(2, '0');
  const day = String(shanghaiDate.getDate()).padStart(2, '0');
  const hours = String(shanghaiDate.getHours()).padStart(2, '0');
  const minutes = String(shanghaiDate.getMinutes()).padStart(2, '0');
  const seconds = String(shanghaiDate.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 读取异常次数记录
async function loadErrorCount() {
  try {
    const errorCountFile = path.join(CONFIG.output.directory, 'error-count.json');
    const data = await fs.readFile(errorCountFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // 如果文件不存在或读取失败，返回空对象
    return {};
  }
}

// 保存异常次数记录
async function saveErrorCount(errorCount) {
  try {
    await ensureOutputDir();
    const errorCountFile = path.join(CONFIG.output.directory, 'error-count.json');
    await fs.writeFile(errorCountFile, JSON.stringify(errorCount, null, 2), 'utf8');
  } catch (error) {
    console.error('保存异常次数记录失败:', error);
  }
}

// 更新域名的异常次数
async function updateErrorCount(domain, isError) {
  const errorCount = await loadErrorCount();
  
  if (isError) {
    // 如果是异常，增加计数
    errorCount[domain] = (errorCount[domain] || 0) + 1;
    console.log(`⚠️  ${domain}: 异常次数增加到 ${errorCount[domain]}`);
  } else {
    // 如果正常，重置计数
    if (errorCount[domain] && errorCount[domain] > 0) {
      console.log(`✅ ${domain}: 恢复正常，异常次数已重置 (之前: ${errorCount[domain]})`);
    }
    errorCount[domain] = 0;
  }
  
  await saveErrorCount(errorCount);
  return errorCount[domain] || 0;
}

// 从URL中提取域名
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    // 如果URL格式不正确，返回原始URL
    return url;
  }
}

async function fetchSourceLinks() {
  try {
    console.log(`📡 从 ${CONFIG.source.url} 获取友情链接数据...`);
    const response = await fetch(CONFIG.source.url, {
      headers: CONFIG.source.headers,
      redirect: 'follow'
    });
    
    if (!response.ok) {
      throw new Error(`获取源数据失败: HTTP ${response.status}`);
    }
    
    const data = await response.json();
    console.log('✅ 源数据获取成功');
    return data;
  } catch (error) {
    console.error(`❌ fetchSourceLinks 错误: ${error.message}`);
    throw new Error(`获取源数据失败: ${error.message}`);
  }
}

async function checkWithXiaoxiaoAPI(url, name) {
  if (!CONFIG.detection.retry.use_xiaoxiao_api) {
    return null;
  }
  
  try {
    console.log(`🔍 ${name}: 使用小小API检测...`);
    const apiUrl = `${CONFIG.detection.retry.xiaoxiao_api_url}?url=${encodeURIComponent(url)}`;
    const startTime = Date.now();
    
    const response = await fetch(apiUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
      },
      timeout: CONFIG.detection.timeout
    });
    
    const latency = Math.round((Date.now() - startTime) / 10) / 100;
    
    if (response.ok) {
      const data = await response.json();
      const statusCode = parseInt(data.data);
      const success = parseInt(data.code) === 200 && (statusCode >= 200 && statusCode < 400);
      
      if (success) {
        console.log(`✅ ${name}: 小小API检测成功 (状态码: ${statusCode}, 延迟: ${latency}s)`);
        return {
          success: true,
          latency: latency,
          status: statusCode,
          attempts: 4, // 表示使用了小小API
          method: 'xiaoxiao_api'
        };
      } else {
        console.log(`❌ ${name}: 小小API检测失败 (状态码: ${statusCode})`);
        return {
          success: false,
          latency: -1,
          status: statusCode,
          attempts: 4,
          method: 'xiaoxiao_api',
          error: `小小API检测失败，状态码: ${statusCode}`
        };
      }
    } else {
      console.log(`❌ ${name}: 小小API请求失败 (HTTP ${response.status})`);
      return {
        success: false,
        latency: -1,
        status: 0,
        attempts: 4,
        method: 'xiaoxiao_api',
        error: `小小API请求失败，HTTP ${response.status}`
      };
    }
  } catch (error) {
    console.error(`❌ ${name}: 小小API检测异常 - ${error.message}`);
    return {
      success: false,
      latency: -1,
      status: 0,
      attempts: 4,
      method: 'xiaoxiao_api',
      error: `小小API检测异常: ${error.message}`
    };
  }
}

async function checkLinkWithRetry(url, name) {
  const maxAttempts = CONFIG.detection.retry.enabled ? CONFIG.detection.retry.max_attempts : 1;
  const retryDelay = CONFIG.detection.retry.delay;
  
  // 先进行直接访问重试
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`🔄 ${name}: 第${attempt}次直接访问重试...`);
        // 重试前等待
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else {
        console.log(`🔍 检测 ${name} (${url})...`);
      }
      
      const startTime = Date.now();
      const response = await fetch(url, {
        headers: CONFIG.request_headers,
        redirect: 'follow',
        timeout: CONFIG.detection.timeout
      });
      const latency = Math.round((Date.now() - startTime) / 10) / 100;
      
      const success = response.status >= CONFIG.detection.success_status_min && 
                     response.status <= CONFIG.detection.success_status_max;
      
      if (success) {
        if (attempt > 1) {
          console.log(`✅ ${name}: 第${attempt}次直接访问重试成功 (状态码: ${response.status}, 延迟: ${latency}s)`);
        } else {
          console.log(`✅ ${name}: 直接访问检测成功 (状态码: ${response.status}, 延迟: ${latency}s)`);
        }
        
        return {
          success: true,
          latency: latency,
          status: response.status,
          attempts: attempt,
          method: 'direct'
        };
      } else {
        if (attempt < maxAttempts) {
          console.log(`⚠️  ${name}: 第${attempt}次直接访问失败 (状态码: ${response.status}), 准备重试...`);
        } else {
          console.log(`⚠️  ${name}: 第${maxAttempts}次直接访问失败 (状态码: ${response.status}), 尝试使用小小API...`);
        }
      }
      
    } catch (error) {
      if (attempt < maxAttempts) {
        console.log(`⚠️  ${name}: 第${attempt}次直接访问异常 - ${error.message}, 准备重试...`);
      } else {
        console.log(`⚠️  ${name}: 第${maxAttempts}次直接访问异常 - ${error.message}, 尝试使用小小API...`);
      }
    }
  }
  
  // 直接访问都失败了，尝试使用小小API
  const xiaoxiaoResult = await checkWithXiaoxiaoAPI(url, name);
  if (xiaoxiaoResult && xiaoxiaoResult.success) {
    return xiaoxiaoResult;
  }
  
  // 所有检测方法都失败了
  return {
    success: false,
    latency: -1,
    status: 0,
    error: `经过${maxAttempts}次直接访问和小小API检测后仍然失败`,
    attempts: maxAttempts + 1,
    method: 'all_failed'
  };
}

async function checkLink(url, name) {
  return await checkLinkWithRetry(url, name);
}

// 添加并发控制函数
async function batchProcess(items, processor) {
  const results = [];
  for (let i = 0; i < items.length; i += CONFIG.detection.batch_size) {
    const batch = items.slice(i, i + CONFIG.detection.batch_size);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
    if (i + CONFIG.detection.batch_size < items.length) {
      await new Promise(resolve => setTimeout(resolve, CONFIG.detection.batch_delay));
    }
  }
  return results;
}

async function checkAllLinks() {
  try {
    console.log('📡 获取源数据...');
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
    
    console.log(`📋 获取到 ${linksToCheck.length} 个友情链接`);
    console.log('🔍 开始直接检测所有链接...');

    // 直接检查所有链接
    const processCheck = async (item) => {
      const result = await checkLink(item.link, item.name);
      
      return {
        name: item.name,
        link: item.link,
        favicon: item.favicon,
        latency: result.latency,
        success: result.success,
        status: result.status,
        error: result.error,
        attempts: result.attempts || 1,
        method: result.method || 'direct'
      };
    };

    const checkResults = await batchProcess(linksToCheck, processCheck);

    // 获取异常次数记录
    const errorCount = await loadErrorCount();
    
    // 根据最终检测结果更新异常次数
    const finalResultsWithErrorCount = checkResults.map(item => {
      const domain = extractDomain(item.link);
      const currentErrorCount = errorCount[domain] || 0;
      
      if (item.success) {
        // 检测成功，重置异常次数
        if (currentErrorCount > 0) {
          errorCount[domain] = 0;
          console.log(`✅ ${domain}: 恢复正常，异常次数已重置 (之前: ${currentErrorCount})`);
        }
        return {
          ...item,
          error_count: 0
        };
      } else {
        // 检测失败，增加异常次数
        const newErrorCount = currentErrorCount + 1;
        errorCount[domain] = newErrorCount;
        console.log(`⚠️  ${domain}: 异常次数增加到 ${newErrorCount}`);
        return {
          ...item,
          error_count: newErrorCount
        };
      }
    });

    // 保存更新后的异常次数
    if (CONFIG.output.save_error_count) {
      await saveErrorCount(errorCount);
    }

    const now = new Date();

    const accessible = finalResultsWithErrorCount.filter(r => r.success).length;
    const resultData = {
      timestamp: formatShanghaiTime(now),
      accessible_count: accessible,
      inaccessible_count: finalResultsWithErrorCount.length - accessible,
      total_count: finalResultsWithErrorCount.length,
      link_status: finalResultsWithErrorCount
    };
    
    console.log('📝 整理检测结果...');
    
    return { resultData };
  } catch (error) {
    console.error(`checkAllLinks 错误: ${error.message}`);
    throw error;
  }
}

async function ensureOutputDir() {
  try {
    await fs.access(CONFIG.output.directory);
  } catch {
    await fs.mkdir(CONFIG.output.directory, { recursive: true });
  }
}

async function copyStaticFiles() {
  try {
    // 复制index.html
    const sourceHtml = path.join('./output', 'index.html');
    const targetHtml = path.join(CONFIG.output.directory, 'index.html');
    await fs.copyFile(sourceHtml, targetHtml);
    console.log('✅ index.html 已复制');
    
    // 复制favicon.png
    const sourceFavicon = path.join('./output', 'favicon.png');
    const targetFavicon = path.join(CONFIG.output.directory, 'favicon.png');
    await fs.copyFile(sourceFavicon, targetFavicon);
    console.log('✅ favicon.png 已复制');
    
  } catch (error) {
    console.error('❌ 复制静态文件失败:', error.message);
    // 不退出程序，因为静态文件不是必需的
  }
}

async function saveResults() {
  try {
    // 首先加载配置
    CONFIG = await loadConfig();
    console.log('✅ 配置文件加载成功');
    
    await ensureOutputDir();
    
    console.log('🚀 开始检测友情链接...');
    console.log('=' * 50);
    
    const { resultData } = await checkAllLinks();
    
    console.log('=' * 50);
    console.log('📊 检测统计:');
    console.log(`✅ 可访问链接: ${resultData.accessible_count}`);
    console.log(`❌ 不可访问链接: ${resultData.inaccessible_count}`);
    console.log(`📈 总链接数: ${resultData.total_count}`);
    console.log(`📅 检测时间: ${resultData.timestamp}`);
    
    // 保存主要状态数据
    console.log('💾 保存检测结果...');
    await fs.writeFile(
      path.join(CONFIG.output.directory, 'status.json'),
      JSON.stringify(resultData, null, 2),
      'utf8'
    );
    console.log('✅ status.json 已保存');
    
    // 显示文件生成信息
    console.log('📁 生成的文件:');
    console.log('   - status.json (主要检测结果)');
    if (CONFIG.output.save_error_count) {
      console.log('   - error-count.json (异常次数记录)');
    }
    console.log('   - index.html (可视化展示页面)');
    console.log('   - favicon.png (网站图标)');
    
    // 复制静态文件
    if (CONFIG.output.copy_static_files) {
      console.log('📁 复制静态文件...');
      await copyStaticFiles();
    } else {
      console.log('⏭️  跳过静态文件复制');
    }
    
    console.log('🎉 检测完成！结果已保存到page文件夹');
    
  } catch (error) {
    console.error('❌ 保存结果时出错:', error);
    process.exit(1);
  }
}

// 如果直接运行此文件，则执行检测
if (import.meta.url === `file://${process.argv[1]}`) {
  saveResults();
}

