# frozen_string_literal: true

# == Schema Information
#
# Table name: expense_items
#
#  id               :bigint           not null, primary key
#  expenseable_type :string
#  expenseable_id   :bigint
#  quantity         :integer
#  description      :string
#  expense_type     :integer
#  unit_price       :decimal(, )
#
class ExpenseItem < ApplicationRecord
  enum expense_type: %i[equiptments travel_allowance misalliance]
  belongs_to :expenseable, polymorphic: true
  after_save :update_expense, if: proc { |a| a.expenseable_type == 'ClientExpense' }

  def update_expense
    expenseable.update_amount
  end
end
