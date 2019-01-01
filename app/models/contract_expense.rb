class ContractExpense < ApplicationRecord
  require 'sequence'

  belongs_to :contract

  after_save :set_cont_expense_on_seq 
  
  def set_cont_expense_on_seq
    ledger = Sequence::Client.new(
        ledger_name: 'company-dev',
        credential: 'OUUY4ZFYQO4P3YNC5JC3GMY7ZQJCSNTH'
    )

    self.contract.set_on_seq
    if self.amount.present? && self.amount > 0 
      tx = ledger.transactions.transact do |builder|
        builder.issue(
          flavor_id: 'usd',
          amount: self&.amount.to_i,
          destination_account_id: 'cont_'+self.contract_id.to_s+'_expense',
          action_tags: {
            type: 'issue',
            contract: self.contract_id,
            candidate_id: self.candidate_id,
            cycle_id: self.cycle_id,
            expense_type: self.con_ex_type

          }
        )
      end
    end
  end

end

