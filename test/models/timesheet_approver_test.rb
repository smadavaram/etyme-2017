# frozen_string_literal: true

# == Schema Information
#
# Table name: timesheet_approvers
#
#  id           :integer          not null, primary key
#  user_id      :integer
#  timesheet_id :integer
#  created_at   :datetime         not null
#  updated_at   :datetime         not null
#  status       :integer
#
require 'test_helper'

class TimesheetApproverTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
