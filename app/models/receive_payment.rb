# frozen_string_literal: true

class ReceivePayment < ApplicationRecord
  belongs_to :invoice

  after_create :set_invoice_balance

  def set_invoice_balance
    invoice.update_payment_receive
    # set_seq_paid_in
  end

  def set_seq_paid_in
    ledger = Sequence::Client.new(
      ledger_name: ENV['seq_ledgers'],
      credential: ENV['seq_token']
    )

    tx = ledger.transactions.transact do |builder|
      builder.transfer(
        flavor_id: 'tym',
        amount: (amount_received.to_i * 100).to_i,
        destination_account_id: "#{invoice.contract.sell_contract.company.slug.to_s + invoice.contract.sell_contract.company.id.to_s}_q",
        source_account_id: "#{invoice.contract.buy_contract.candidate.full_name.parameterize + invoice.contract.buy_contract.candidate.id.to_s}_exp",
        action_tags: {
          'Fixed' => 'false',
          'Status' => 'Clear',
          'Account' => '',
          'CycleId' => invoice.ig_cycle_id.to_s,
          'ObjType' => 'IP',
          'ContractId' => invoice.contract_id.to_s,
          'PostingDate' => Time.now.strftime('%m/%d/%Y'),
          'CycleFrom' => invoice.start_date.strftime('%m/%d/%Y'),
          'CycleTo' => invoice.end_date.strftime('%m/%d/%Y'),
          'Documentdate' => Time.now.strftime('%m/%d/%Y'),
          'TransactionType' => invoice.contract.buy_contract.contract_type == 'C2C' ? 'C2C' : 'W2'
        }
      )
    end
  end
end
