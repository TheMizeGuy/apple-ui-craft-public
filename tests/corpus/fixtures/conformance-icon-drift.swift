// FIXTURE: conformance-icon-drift
// Plants: conformance/mixed-icon-set
//
// Two glyph families bundled from a web icon kit sit beside ShareLink's SF
// Symbol in one bottom toolbar, where heart and bubble.left exist as SF Symbols.

import SwiftUI

// Minimal stubs so the fixture stands alone. Not part of the planted defect.
struct Article { var title: String; var byline: String; var body: String; var url: URL }
struct CommentsSheet: View { let article: Article; var body: some View { Text(article.title) } }

struct ArticleDetail: View {
    let article: Article
    @State private var isLiked = false
    @State private var isShowingComments = false
    @ScaledMetric(relativeTo: .body) private var glyph: CGFloat = 22

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(article.title)
                    .font(.title.bold())
                Text(article.byline)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Text(article.body)
            }
            .frame(maxWidth: 700, alignment: .leading)
            .frame(maxWidth: .infinity)
            .padding()
        }
        .navigationTitle(article.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .bottomBar) {
                ShareLink(item: article.url)
                Spacer()
                Button { isLiked.toggle() } label: {
                    Image(isLiked ? "ri-heart-fill" : "ri-heart-line")
                        .renderingMode(.template)
                        .resizable()
                        .frame(width: glyph, height: glyph)
                }
                .accessibilityLabel("Like")
                .accessibilityAddTraits(isLiked ? .isSelected : [])
                Button { isShowingComments = true } label: {
                    Image("ri-chat-3-line")
                        .renderingMode(.template)
                        .resizable()
                        .frame(width: glyph, height: glyph)
                }
                .accessibilityLabel("Comments")
            }
        }
        .sensoryFeedback(trigger: isLiked) { _, liked in liked ? .success : .impact(weight: .light) }
        .sheet(isPresented: $isShowingComments) {
            CommentsSheet(article: article)
        }
    }
}
