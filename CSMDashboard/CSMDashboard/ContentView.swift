import SwiftUI

struct ContentView: View {
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "doc.text.magnifyingglass")
                .font(.system(size: 72))
                .foregroundColor(.blue)

            Text("CSM Case Dashboard")
                .font(.title)
                .fontWeight(.bold)

            Text("Safari Extension이 설치되었습니다")
                .font(.body)
                .foregroundColor(.secondary)

            VStack(alignment: .leading, spacing: 12) {
                Text("사용 방법:")
                    .font(.headline)

                HStack(alignment: .top, spacing: 8) {
                    Text("1.")
                    Text("설정 > Safari > 확장 프로그램으로 이동")
                }

                HStack(alignment: .top, spacing: 8) {
                    Text("2.")
                    Text("CSM Case Dashboard 켜기")
                }

                HStack(alignment: .top, spacing: 8) {
                    Text("3.")
                    Text("Safari에서 ITSM 사이트 접속 후 확장 프로그램 버튼 클릭")
                }
            }
            .padding()
            .background(Color.gray.opacity(0.1))
            .cornerRadius(12)
            .padding(.horizontal)

            Button(action: {
                if let url = URL(string: "App-Prefs:SAFARI") {
                    UIApplication.shared.open(url)
                }
            }) {
                Text("설정 열기")
                    .fontWeight(.semibold)
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(10)
            }
            .padding(.horizontal)
        }
        .padding()
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}
