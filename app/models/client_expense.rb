class ClientExpense < ApplicationRecord

  enum status: [:open, :submitted, :approved , :partially_approved, :rejected, :invoiced]

  belongs_to :candidate
  belongs_to :company, optional: true
  belongs_to :contract, optional: true
  belongs_to :user, optional: true
  belongs_to :job, optional: true

  after_update :set_ce_on_seq
  
  scope :open_expenses, -> {where(status: 0)}


  def submitted(client_expense_params, days, total_amount)
    self.assign_attributes(client_expense_params)
    self.amount = total_amount
    self.status = 1
    self.save
    con_cycle = ContractCycle.find(self.ce_cycle_id)
    con_cycle.update_attributes(completed_at: Time.now, status: "completed")
  end


  def set_ce_on_seq
    ledger = Sequence::Client.new(
        ledger_name: 'company-dev',
        credential: 'OUUY4ZFYQO4P3YNC5JC3GMY7ZQJCSNTH'
    )
    ce_issue = ledger.transactions.transact do |builder|
      builder.issue(
        flavor_id: 'usd',
        amount: self&.amount.to_i,
        destination_account_id: 'cons_'+self&.contract.buy_contracts.first.candidate_id.to_s,
        action_tags: {
          type: 'issue',
          contract: self.contract_id,
          candidate: self.contract.buy_contracts.first.candidate_id.to_s,
          cycle_id: self.ce_cycle_id,
          start_date: self.start_date,
          end_date: self.end_date
        }
      )
    end
  end
end
