# frozen_string_literal: true

# == Schema Information
#
# Table name: expenses
#
#  id              :bigint           not null, primary key
#  contract_id     :integer
#  account_id      :integer
#  mailing_address :text
#  terms           :string
#  bill_date       :date
#  due_date        :date
#  bill_no         :string
#  total_amount    :float
#  created_at      :datetime         not null
#  updated_at      :datetime         not null
#  bill_type       :integer
#  ce_ap_cycle_id  :text
#  ce_in_cycle_id  :integer
#  status          :integer
#  attachment      :string
#  salary_ids      :text
#
class Expense < ApplicationRecord
  include PublicActivity::Model
  belongs_to :contract, optional: true
  belongs_to :company_contact, optional: true, foreign_key: :account_id

  has_many :expense_accounts, dependent: :destroy
  has_many :activities, as: :trackable, class_name: 'PublicActivity::Activity', dependent: :destroy
  has_many :salary_items, as: :salaryable

  accepts_nested_attributes_for :expense_accounts, allow_destroy: true, reject_if: :all_blank

  enum bill_type: %i[salary_advanced company_expense client_expense]
  enum status: %i[bill_generated invoice_generated paid salaried]

  serialize :ce_ap_cycle_id
  # serialize :salary_ids

  # after_create :set_expense_on_seq

  def set_expense_on_seq
    if bill_type == 'client_expense'
      ledger = Sequence::Client.new(
        ledger_name: 'company-dev',
        credential: 'OUUY4ZFYQO4P3YNC5JC3GMY7ZQJCSNTH'
      )
      # self.contract.set_on_seq
      ce_issue = ledger.transactions.transact do |builder|
        builder.transfer(
          flavor_id: 'usd',
          amount: total_amount.to_i,
          source_account_id: 'cont_' + contract_id.to_s,
          destination_account_id: 'cons_' + self&.contract.buy_contract.candidate_id.to_s,
          action_tags: {
            type: 'transfer',
            contract: contract_id,
            candidate: contract.buy_contract.candidate_id.to_s,
            due_date: due_date,
            bill_type: bill_type
          }
        )
      end
    end
  end

  def set_ce_invoice_on_seq(expense)
    ledger = Sequence::Client.new(
      ledger_name: 'company-dev',
      credential: 'OUUY4ZFYQO4P3YNC5JC3GMY7ZQJCSNTH'
    )
    expense.contract.set_on_seq
    ce_invoice = ledger.transactions.transact do |builder|
      builder.issue(
        flavor_id: 'usd',
        amount: expense&.total_amount.to_i,
        destination_account_id: 'cust_' + expense&.contract&.sell_contracts&.first&.company_id.to_s + '_expense',
        action_tags: {
          type: 'issue',
          contract: expense.contract_id,
          bill_type: expense.bill_type
        }
      )
    end
  end

  def set_ce_invoice_payment_on_seq(expense)
    ledger = Sequence::Client.new(
      ledger_name: 'company-dev',
      credential: 'OUUY4ZFYQO4P3YNC5JC3GMY7ZQJCSNTH'
    )
    expense.contract.set_on_seq

    ledger.transactions.transact do |builder|
      builder.transfer(
        flavor_id: 'usd',
        amount: expense.total_amount.to_i,
        source_account_id: 'cust_' + expense&.contract&.sell_contract&.company_id.to_s + '_expense',
        destination_account_id: 'comp_' + expense.contract.company_id.to_s + '_treasury',
        action_tags: {
          type: 'transfer',
          contract: expense.contract_id,
          candidate: expense.contract.buy_contract.candidate_id.to_s,
          due_date: expense.due_date,
          bill_type: expense.bill_type
        }
      )

      builder.retire(
        flavor_id: 'usd',
        amount: expense.total_amount.to_i,
        source_account_id: 'cons_' + expense.contract.candidate_id.to_s,
        action_tags: { type: 'client expense invoice payment' }
      )

      builder.transfer(
        flavor_id: 'usd',
        amount: expense.total_amount.to_i,
        source_account_id: 'comp_' + expense.contract.company_id.to_s + '_treasury',
        destination_account_id: 'cons_' + expense.contract.candidate_id.to_s,
        action_tags: {
          type: 'transfer',
          contract: expense.contract_id,
          candidate: expense.contract.buy_contract.candidate_id.to_s,
          due_date: expense.due_date,
          bill_type: expense.bill_type
        }
      )
    end
  end
end
