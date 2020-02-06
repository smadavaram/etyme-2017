# frozen_string_literal: true

class ExpenseAccount < ApplicationRecord
  belongs_to :expense
  belongs_to :expense_type
  attr_accessor :pay_type

  enum status: %i[opened cleared cancelled]

  # after_create :issue_bal_on_seq
  # after_update :set_expense_on_seq

  def set_expense_on_seq
    ledger = Sequence::Client.new(
      ledger_name: 'company-dev',
      credential: 'OUUY4ZFYQO4P3YNC5JC3GMY7ZQJCSNTH'
    )
    sleep 1
    if expense.contract.buy_contract.contract_type == 'C2C'
    else
      if pay_type == 'reject'
        ledger.transactions.transact do |builder|
          builder.retire(
            flavor_id: 'usd',
            amount: amount.to_i,
            source_account_id: 'cons_' + expense.contract.candidate_id.to_s,
            action_tags: { type: 'expense bill payment' }
          )
        end
      else
        if expense.bill_type == 'company_expense'
          ledger.transactions.transact do |builder|
            builder.transfer(
              flavor_id: 'usd',
              amount: payment.to_i,
              source_account_id: 'cust_' + expense.contract.sell_contract.company_id.to_s + '_treasury',
              destination_account_id: 'cust_' + expense.contract.sell_contract.company_id.to_s + '_expense',
              action_tags: {
                type: 'expense bill payment',
                expense_type: expense_type.name,
                contract_id: expense.contract_id,
                bill_type: expense.bill_type
              }
            )
          end
        else
          sleep 1
          puts 'update start'
          ledger.transactions.transact do |builder|
            builder.transfer(
              flavor_id: 'usd',
              amount: payment.to_i,
              source_account_id: 'cust_' + expense.contract.sell_contract.company_id.to_s + '_treasury',
              destination_account_id: 'cons_' + expense.contract.candidate_id.to_s + '_expense',
              action_tags: {
                type: 'expense bill payment',
                expense_type: expense_type.name,
                contract_id: expense.contract_id,
                bill_type: expense.bill_type
              }
            )
          end
          ledger.transactions.transact do |builder|
            builder.retire(
              flavor_id: 'usd',
              amount: payment.to_i,
              source_account_id: 'cons_' + expense.contract.candidate_id.to_s,
              action_tags: { type: 'expense bill payment' }
            )
          end
          puts 'update end'
        end
      end
    end
  end

  def issue_bal_on_seq
    ledger = Sequence::Client.new(
      ledger_name: 'company-dev',
      credential: 'OUUY4ZFYQO4P3YNC5JC3GMY7ZQJCSNTH'
    )
    sleep 1
    if expense.contract.buy_contract.contract_type == 'C2C'
      vendor_issue = ledger.transactions.transact do |builder|
        builder.issue(
          flavor_id: 'usd',
          amount: self&.amount * 100,
          destination_account_id: 'cust_' + self&.expense&.contract.buy_contract.company_id.to_s,
          action_tags: {
            type: 'issue',
            expense_type: expense_type,
            contract: expense.contract_id,
            bill_type: expense.bill_type
          }
        )
      end
    else
      if expense.bill_type == 'salary_advanced'
        customer_expense = ledger.transactions.transact do |builder|
          builder.issue(
            flavor_id: 'usd',
            amount: (self&.amount.to_i / expense.salary_ids.length) * 100,
            destination_account_id: 'cons_' + self&.expense&.contract&.candidate_id.to_s + '_advance',
            action_tags: {
              type: 'issue',
              expense_type: expense_type.name,
              contract_id: expense.contract_id,
              bill_type: expense.bill_type,
              expense_id: expense.id
            }
          )
        end
      end
    end
  end
end
