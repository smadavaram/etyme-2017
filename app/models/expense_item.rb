class ExpenseItem < ApplicationRecord
  
  enum expense_type: [:equiptments, :travel_allowance, :misalliance]
  
  belongs_to :expenseable, polymorphic: true
  
  after_create :update_expense, if: Proc.new { |a| a.expenseable_type == "ClientExpense" }
  
  def update_expense
    expenseable.update_amount
  end

end