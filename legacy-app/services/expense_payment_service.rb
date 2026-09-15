# frozen_string_literal: true

class ExpensePaymentService
  def initialize(current_user, company)
    @current_user = current_user
    @company = company
  end

  def submit_bill(expense_account_id, bank_id, payment_amount, balance_due, pay_type)
    ActiveRecord::Base.transaction do
      bd = BankDetail.find_by(id: bank_id.to_i)
      unless bd.present?
        return { success: false, errors: ['Please Add Bank to Pay Bill'], redirect: :add_bank }
      end

      unless bd.balance.to_i >= payment_amount.to_i
        return { success: false, errors: ['Insufficient balance in your account please try with another account.'] }
      end

      ex = ExpenseAccount.find_by(id: expense_account_id)
      ex.status = 'cleared' if ex.amount.to_i == (ex.payment.to_i + payment_amount.to_i)
      ex.status = 'cancelled' if pay_type == 'reject'
      ex.payment = ex.payment.to_i + payment_amount.to_i
      ex.balance_due = balance_due
      ex.pay_type = pay_type

      if ex.status != 'cancelled'
        @company.etyme_transactions.create!(
          amount: (ex.payment * -1),
          transaction_type: 'Expense',
          salary_id: ex.expense.salary_ids,
          contract_id: ex.expense.contract_id,
          transaction_user_type: 'candidate',
          transaction_user_id: ex.expense.account_id,
          is_processed: true
        )
        if ex.balance_due > 0
          @company.etyme_transactions.create!(
            amount: (ex.balance_due * -1),
            transaction_type: 'Expense',
            salary_id: ex.expense.salary_ids,
            contract_id: ex.expense.contract_id,
            transaction_user_type: 'candidate',
            transaction_user_id: ex.expense.account_id,
            is_processed: false
          )
        end
      end

      ex.save
      bd.update(balance: bd.balance.to_i - payment_amount.to_i)
      { success: true, message: 'Payment done successfully' }
    end
  end

  def generate_client_expense_invoice(expense_id)
    expense = Expense.find_by(id: expense_id)
    expense.set_ce_invoice_on_seq(expense)
    expense.update(status: 'invoice_generated')
    ClientExpense.where(ce_ap_cycle_id: expense.ce_ap_cycle_id, status: 'bill_generated').update_all(status: 4)
    { success: true, message: 'Invoice generated successfully' }
  end

  def record_invoice_payment(expense_id, attachment)
    expense = Expense.find_by(id: expense_id)
    expense.update(status: 'paid', attachment: attachment)
    ClientExpense.where(ce_ap_cycle_id: expense.ce_ap_cycle_id, status: 'invoice_generated').update_all(status: 'paid')
    expense.set_ce_invoice_payment_on_seq(expense)
    { success: true, message: 'Payment done successfully' }
  end

  def filter_approved_client_expenses(contract_id)
    @company.client_expenses
            .joins(contract: [:client, [buy_contract: :candidate]])
            .approved_client_expenses
            .where(contract_id: contract_id)
            .select('DISTINCT(client_expenses.ce_ap_cycle_id), contracts.number, companies.name, buy_contracts.contract_type, candidates.first_name, candidates.last_name, sum(amount) as total_amount')
            .group('client_expenses.ce_ap_cycle_id', 'contracts.number', 'companies.name', 'buy_contracts.contract_type', 'candidates.first_name', 'candidates.last_name')
            .map(&:attributes)
  end
end
