import SafariServices

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        // iOS Safari Web Extension은 JavaScript로 동작
        // 이 Swift 파일은 빌드를 위한 더미 파일입니다
        context.completeRequest(returningItems: nil, completionHandler: nil)
    }
}
