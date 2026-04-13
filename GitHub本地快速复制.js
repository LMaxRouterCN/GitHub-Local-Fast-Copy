// ==UserScript==
// @name         GitHub 本地快速复制
// @namespace    http://tampermonkey.net/
// @version      3.5
// @description  不请求raw站点,而是从DOM中获取纯文本复制,无网络延迟,更快
// @author       LMaxRouterCN
// @match        https://github.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=github.com
// @grant        none
// ==/UserScript==
(function() {
    'use strict';

    // 全局状态管理器，新增 realBgColor 记住真实底色
    const globalState = {
        status: 'idle', // 'idle' | 'loading' | 'copied'
        endTime: 0,
        realBgColor: 'transparent'
    };

    // 记录上一次的完整URL，用于检测SPA导航导致的页面切换
    let lastUrl = location.href;

    // 判断当前页面是否为blob或blame页面（需要显示快速复制按钮的目标页面）
    function isTargetPage() {
        return /\/(blob|blame)\//.test(location.pathname);
    }

    setInterval(() => {
        // 【SPA导航检测】URL变化时说明GitHub做了客户端路由跳转，需要重置状态
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            // 重置全局状态
            globalState.status = 'idle';
            globalState.endTime = 0;
            // 移除可能残留的旧按钮（SPA导航后React会替换DOM，旧按钮可能已脱离文档流）
            const staleBtn = document.getElementById('fast-copy-btn');
            if (staleBtn) {
                staleBtn.remove();
            }
        }

        // 非目标页面（非blob/blame）直接跳过，不做任何DOM操作
        if (!isTargetPage()) return;

        const existingBtn = document.getElementById('fast-copy-btn');
        if (existingBtn) {
            // 【核心修复：状态同步心跳】
            // 即使按钮存在，也要检查全局状态是否被后台偷偷改了
            if (globalState.status === 'copied' && existingBtn.textContent !== 'Copied!') {
                const remainingTime = globalState.endTime - Date.now();
                if (remainingTime > 0) {
                    existingBtn.textContent = 'Copied!';
                    existingBtn.style.color = '#3fb950';
                    existingBtn.style.zIndex = '2';
                    setTimeout(() => resetBtnState(existingBtn), remainingTime);
                } else {
                    resetBtnState(existingBtn);
                }
            } else if (globalState.status === 'idle' && existingBtn.textContent === 'Loading...') {
                // 兜底防卡死机制
                resetBtnState(existingBtn);
            }
            return; // 按钮已存在且状态已同步，结束本轮
        }

        // 以下是没有按钮时，寻找锚点并创建按钮的逻辑
        let rawLink = document.querySelector('a[class*="BlobViewHeader-module__LinkButton"]');
        if (!rawLink) {
            const allLinks = document.querySelectorAll('a');
            for (let link of allLinks) {
                if (link.textContent.trim().toLowerCase() === 'raw') {
                    rawLink = link;
                    break;
                }
            }
        }

        if (rawLink) {
            const buttonGroup = rawLink.parentElement.parentElement;
            if (buttonGroup) {
                let realBtnRef = null;
                for(let child of buttonGroup.children) {
                    if (child !== rawLink && (child.tagName === 'BUTTON' || child.tagName === 'A')) {
                        realBtnRef = child;
                        break;
                    }
                }
                if (!realBtnRef) realBtnRef = rawLink;
                initFastCopyButton(buttonGroup, rawLink, realBtnRef);
            }
        }
    }, 150);

    // 统一重置状态，直接从全局读取背景色
    function resetBtnState(btn) {
        globalState.status = 'idle';
        globalState.endTime = 0;
        if (btn) {
            btn.textContent = 'Fast Copy';
            btn.style.color = '';
            btn.style.backgroundColor = globalState.realBgColor;
            btn.style.zIndex = '1';
        }
    }

    function initFastCopyButton(buttonGroup, rawLink, realBtnRef) {
        const fastCopyBtn = document.createElement('button');
        fastCopyBtn.id = 'fast-copy-btn';
        fastCopyBtn.textContent = 'Fast Copy';

        const refStyle = window.getComputedStyle(realBtnRef);
        const realBgColor = refStyle.backgroundColor;

        // 存入全局，供后续任何新创建的按钮使用
        globalState.realBgColor = realBgColor;

        fastCopyBtn.style.cssText = `
            display: ${refStyle.display};
            align-items: ${refStyle.alignItems};
            justify-content: ${refStyle.justifyContent};
            height: ${refStyle.height};
            line-height: ${refStyle.lineHeight};
            padding-top: ${refStyle.paddingTop};
            padding-bottom: ${refStyle.paddingBottom};
            padding-left: 16px;
            padding-right: 16px;
            color: ${refStyle.color};
            background-color: ${realBgColor};
            border: 1px solid ${refStyle.borderColor};
            border-radius: 6px 0 0 6px;
            font-size: 14px;
            font-weight: 400;
            cursor: pointer;
            transition: background-color 0.15s ease-in-out;
            font-family: inherit;
            white-space: nowrap;
            box-sizing: border-box;
            margin-right: -1px;
            position: relative;
            z-index: 1;
            text-align: center;
        `;

        rawLink.style.borderRadius = '0';

        // 初始化时的状态接力
        if (globalState.status === 'loading') {
            fastCopyBtn.textContent = 'Loading...';
            fastCopyBtn.style.color = '#8b949e';
        } else if (globalState.status === 'copied') {
            const remainingTime = globalState.endTime - Date.now();
            if (remainingTime > 0) {
                fastCopyBtn.textContent = 'Copied!';
                fastCopyBtn.style.color = '#3fb950';
                fastCopyBtn.style.zIndex = '2';
                setTimeout(() => resetBtnState(fastCopyBtn), remainingTime);
            } else {
                resetBtnState(fastCopyBtn);
            }
        }

        fastCopyBtn.addEventListener('mouseenter', () => {
            if (globalState.status === 'idle') {
                fastCopyBtn.style.backgroundColor = '#262c36';
                fastCopyBtn.style.zIndex = '2';
            }
        });

        fastCopyBtn.addEventListener('mouseleave', () => {
            if (globalState.status === 'idle') {
                fastCopyBtn.style.backgroundColor = globalState.realBgColor;
                fastCopyBtn.style.zIndex = '1';
            }
        });

        buttonGroup.insertBefore(fastCopyBtn, buttonGroup.firstChild);

        requestAnimationFrame(() => {
            const actualWidth = fastCopyBtn.offsetWidth;
            if (actualWidth > 0) {
                fastCopyBtn.style.width = `${actualWidth}px`;
            }
        });

        // --- 交互逻辑 ---
        fastCopyBtn.addEventListener('click', async () => {
            if (globalState.status !== 'idle') return;

            const codeContainer = document.querySelector('div.react-code-file-contents');
            if (codeContainer) {
                performCopy(codeContainer, fastCopyBtn);
            } else {
                const tabContainer = document.querySelector('ul[class*="BlobTabButtons-module"]');
                if (tabContainer) {
                    const buttons = tabContainer.querySelectorAll('li button');
                    let codeTabBtn = null;
                    for (let btn of buttons) {
                        if (btn.textContent.trim() === 'Code') {
                            codeTabBtn = btn;
                            break;
                        }
                    }

                    if (codeTabBtn) {
                        globalState.status = 'loading';
                        fastCopyBtn.textContent = 'Loading...';
                        fastCopyBtn.style.color = '#8b949e';
                        fastCopyBtn.style.backgroundColor = globalState.realBgColor;
                        codeTabBtn.click();

                        waitForCodeView(() => {
                            const newCodeContainer = document.querySelector('div.react-code-file-contents');
                            if (newCodeContainer) {
                                // 注意：这里传入的 fastCopyBtn 可能已经被 React 销毁了，没关系，performCopy 会更新全局状态，由上面的"心跳"负责更新新按钮
                                performCopy(newCodeContainer, fastCopyBtn);
                            } else {
                                resetBtnState(fastCopyBtn);
                                alert('自动切换到 Code 视图失败或加载超时，请手动切换后再试。');
                            }
                        });
                    } else {
                        alert('未找到 Code 视图切换按钮。');
                    }
                } else {
                    alert('未找到视图切换容器，页面结构可能发生了重大改变。');
                }
            }
        });
    }

    function waitForCodeView(callback) {
        let attempts = 0;
        const maxAttempts = 50;
        const checker = setInterval(() => {
            attempts++;
            if (document.querySelector('div.react-code-file-contents')) {
                clearInterval(checker);
                setTimeout(callback, 150);
            } else if (attempts >= maxAttempts) {
                clearInterval(checker);
                callback();
            }
        }, 100);
    }

    async function performCopy(codeContainer, currentBtn) {
        const codeLines = codeContainer.querySelectorAll('div.react-code-text:not(.react-line-number)');
        if (codeLines.length === 0) {
            resetBtnState(currentBtn);
            alert('未能提取到代码文本。');
            return;
        }

        const textContent = Array.from(codeLines)
            .map(line => line.textContent.replace(/[\r\n]/g, ''))
            .join('\n');

        try {
            await navigator.clipboard.writeText(textContent);

            // 无论 currentBtn 是不是已经被销毁，只管更新全局状态！
            globalState.status = 'copied';
            globalState.endTime = Date.now() + 2000;

            // 试着直接修改当前按钮（如果它还活着的话）
            if (currentBtn && currentBtn.id === 'fast-copy-btn' && currentBtn.isConnected) {
                currentBtn.textContent = 'Copied!';
                currentBtn.style.color = '#3fb950';
                currentBtn.style.zIndex = '2';
                setTimeout(() => resetBtnState(currentBtn), 2000);
            }

            // 如果按钮已经死了，不用管，上面的"心跳"会自动接管并更新新按钮
        } catch (err) {
            console.error('Fast Copy 失败:', err);
            resetBtnState(currentBtn);
            alert('复制失败，请检查浏览器剪贴板权限。');
        }
    }
})();
