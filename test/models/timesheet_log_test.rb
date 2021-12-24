# frozen_string_literal: true

# == Schema Information
#
# Table name: timesheet_logs
#
#  id               :integer          not null, primary key
#  timesheet_id     :integer
#  transaction_day  :date
#  status           :integer          default("pending")
#  created_at       :datetime         not null
#  updated_at       :datetime         not null
#  contract_term_id :integer
#
require 'test_helper'

class TimesheetLogTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
