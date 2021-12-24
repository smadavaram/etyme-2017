# frozen_string_literal: true

# == Schema Information
#
# Table name: salaries
#
#  id                    :bigint           not null, primary key
#  contract_id           :integer
#  company_id            :integer
#  candidate_id          :integer
#  start_date            :date
#  end_date              :date
#  status                :integer
#  sc_cycle_id           :integer
#  sp_cycle_id           :integer
#  sclr_cycle_id         :integer
#  created_at            :datetime         not null
#  updated_at            :datetime         not null
#  total_amount          :decimal(, )      default(0.0)
#  commission_amount     :decimal(, )      default(0.0)
#  billing_amount        :decimal(, )      default(0.0)
#  total_approve_time    :integer          default(0)
#  rate                  :decimal(, )      default(0.0)
#  balance               :decimal(, )      default(0.0)
#  pending_amount        :float
#  salary_advance        :float
#  approved_amount       :float
#  contract_expenses     :decimal(, )      default(0.0)
#  commission_ids        :text             default([]), is an Array
#  commission_calculated :boolean          default(FALSE)
#  previous_balance      :decimal(, )      default(0.0)
#
require 'test_helper'

class SalaryTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
