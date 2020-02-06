# frozen_string_literal: true

class ExpenseItem < ApplicationRecord
  enum expense_type: %i[equiptments travel_allowance misalliance]
  belongs_to :expenseable, polymorphic: true
  after_save :update_expense, if: proc { |a| a.expenseable_type == 'ClientExpense' }

  def update_expense
    expenseable.update_amount
  end
end
