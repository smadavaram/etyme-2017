class CscAccount < ApplicationRecord
  belongs_to :contract_sale_commision, optional: true
  belongs_to :accountable, polymorphic: true, optional: true
  belongs_to :contract, optional: true

  after_create :update_contract_id


  def update_contract_id
    self.contract_id = self.contract_sale_commision.buy_contract.contract_id
    self.save
  end

  def set_commission_on_seq
    ledger = Sequence::Client.new(
      ledger_name: 'company-dev',
      credential: 'OUUY4ZFYQO4P3YNC5JC3GMY7ZQJCSNTH'
    )
    if self.total_amount.present? && self.total_amount > 0
      tx = ledger.transactions.transact do |builder|
        builder.issue(
          flavor_id: 'usd',
          amount: self&.total_amount.to_i,
          destination_account_id: "comm_#{self.id}",
          action_tags: {
            type: 'issue',
            contract: self.contract_id,
          }
        )
      end
    end   
  end


end
