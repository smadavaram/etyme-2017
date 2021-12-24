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
require 'test_helper'

class ExpenseTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
