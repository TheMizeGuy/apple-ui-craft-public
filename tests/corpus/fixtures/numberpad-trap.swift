// FIXTURE: numberpad-trap
// Plants: forms/keyboard-trap, forms/missing-content-type
//
// .numberPad and .decimalPad have no return key. With no keyboard toolbar, no
// tap-to-dismiss and no scrollDismissesKeyboard, the keyboard covers the submit
// button permanently. The missing textContentType on the name field kills
// AutoFill on the same screen.

import SwiftUI

struct PaymentForm: View {
    @State private var name = ""
    @State private var cardNumber = ""
    @State private var amount = ""

    var body: some View {
        Form {
            TextField("Name on card", text: $name)
            TextField("Card number", text: $cardNumber)
                .keyboardType(.numberPad)
            TextField("Amount", text: $amount)
                .keyboardType(.decimalPad)

            Button("Pay") { submit() }
        }
        .navigationTitle("Payment")
    }

    private func submit() {}
}
