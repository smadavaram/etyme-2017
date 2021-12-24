# frozen_string_literal: true

# == Schema Information
#
# Table name: expense_accounts
#
#  id              :bigint           not null, primary key
#  description     :text
#  status          :integer
#  amount          :float
#  created_at      :datetime         not null
#  updated_at      :datetime         not null
#  payment         :integer
#  balance_due     :integer
#  check_no        :string
#  expense_type_id :integer
#  expense_id      :bigint
#
require 'test_helper'

class ExpenseAccountTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
