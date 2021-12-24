# frozen_string_literal: true

# == Schema Information
#
# Table name: leaves
#
#  id               :integer          not null, primary key
#  from_date        :date
#  till_date        :date
#  reason           :string
#  response_message :string
#  status           :integer          default("pending")
#  leave_type       :string
#  user_id          :integer
#  created_at       :datetime         not null
#  updated_at       :datetime         not null
#
require 'test_helper'

class LeaveTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
