// var origin = ''
// var iWantRefresh = false
//取消单词拼写检查
window.onload = () => {
    setTimeout(() => {
        for (const item of document.getElementsByTagName("input")) {
            item.spellcheck = false;
        }
    }, 300)
}
window.addEventListener('message', (event) => {
    var getData = event.data
    // origin = event.origin
    BookPreview.isShowAlert = false; //把是否提示需要刷新设为false（不需要）
    switch (getData.module) {
        case 'scene': {
            // var obj = {}
            // obj[getData.key] = getData.value
            // var keyBridge = new KeyBridge(obj)
            // if (keyBridge.functionName != 'showAlert') {
            //     keyBridge;
            // } else {
            //     top.postMessage(false, event.origin)
            // }
            top.postMessage(false, event.origin)
            break;
        }
        case ('setting'): {
            top.postMessage(false, event.origin)
            // var obj = {}
            // obj[getData.key] = getData.value
            // var keyBridge = new KeyBridge(obj)
            // if (keyBridge.isRefresh) {
            //   top.postMessage(false, '*');
            // } else {
            //   if (keyBridge.functionName != 'showAlert') {
            //       top.postMessage(true, event.origin)
            //       keyBridge;
            //   } else {
            //       top.postMessage(false, event.origin)
            //   }
            // }
            break;
        }
        case 'bmtConfig': {
            // var obj = {}
            // obj[getData.key] = getData.value
            // var keyBridge = new KeyBridge(obj)
            // if (keyBridge.functionName != 'showAlert') {
            //     keyBridge;
            // } else {
            //     top.postMessage(false, event.origin)
            // }
            top.postMessage(false, event.origin)
            break;
        }
        case 'changePage': {
            gotoPageFun(getData.page)
            break;
        }
        case 'storage': {
            let href = location.href
            const hash = location.hash
            href = href.replace(hash, '')
            const storageKey = `${href}${getData.key}`
            window.localStorage.removeItem(storageKey)
            window.localStorage.removeItem('passward')
            window.localStorage.removeItem('username')
            if (getData.key === 'localPassward' || getData.key === 'localUsername') {
                const src = href.includes('?') ? href.split('?')[0] : ''
                const name = getData.key === 'localPassward' ? '?passward' : '?username'
                window.localStorage.removeItem(src + name)
            }
            break
        }
        case "refreshIframe": {
            iWantRefresh = true
            window.location.reload()
        }
        default: {}
    }
})
