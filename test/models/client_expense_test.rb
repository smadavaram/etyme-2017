# frozen_string_literal: true

# == Schema Information
#
# Table name: client_expenses
#
#  id             :bigint           not null, primary key
#  job_id         :integer
#  user_id        :integer
#  company_id     :integer
#  contract_id    :integer
#  status         :integer          default("pending_expense")
#  amount         :float
#  start_date     :date
#  end_date       :date
#  submitted_date :date
#  candidate_id   :integer
#  ce_cycle_id    :integer
#  ce_ap_cycle_id :integer
#  created_at     :datetime         not null
#  updated_at     :datetime         not null
#  ce_in_cycle_id :integer
#
require 'test_helper'

class ClientExpenseTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
