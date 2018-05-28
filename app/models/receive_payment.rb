class ReceivePayment < ApplicationRecord
  belongs_to :invoice

  after_create :set_invoice_balance

  def set_invoice_balance
    if self.invoice.balance == self.amount_received || self.posted_as_discount
      self.invoice.update_attributes(balance: 0, status: :paid)
    else
      self.invoice.update(balance: (self.invoice.balance - self.amount_received))
    end
    set_seq_paid_in
  end

  def set_seq_paid_in
    ledger = Sequence::Client.new(
        ledger_name: ENV['seq_ledgers'],
        credential: ENV['seq_token']
    )

    tx = ledger.transactions.transact do |builder|
      builder.transfer(
          flavor_id: 'tym',
          amount: (self.amount_received.to_i * 100).to_i,
          destination_account_id: "#{self.invoice.contract.sell_contracts.first.company.slug.to_s + self.invoice.contract.sell_contracts.first.company.id.to_s}_q",
          source_account_id: "#{self.invoice.contract.buy_contracts.first.candidate.full_name.parameterize + self.invoice.contract.buy_contracts.first.candidate.id.to_s}_exp",
          action_tags: {
              "Fixed" => "false",
              "Status" => "Clear",
              "Account" => "",
              "CycleId" => self.invoice.ig_cycle_id.to_s,
              "ObjType" => "IP",
              "ContractId" => self.invoice.contract_id.to_s,
              "PostingDate" => Time.now.strftime("%m/%d/%Y"),
              "CycleFrom" => self.invoice.start_date.strftime("%m/%d/%Y"),
              "CycleTo" => self.invoice.end_date.strftime("%m/%d/%Y"),
              "Documentdate" => Time.now.strftime("%m/%d/%Y"),
              "TransactionType" => self.invoice.contract.buy_contracts.first.contract_type == "C2C" ? "C2C" : "W2"
          },
      )
    end
  end
end