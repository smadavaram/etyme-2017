# frozen_string_literal: true

# == Schema Information
#
# Table name: change_rates
#
#  id            :bigint           not null, primary key
#  rateable_id   :integer
#  from_date     :date
#  to_date       :date
#  rate_type     :string
#  rate          :float
#  created_at    :datetime         not null
#  updated_at    :datetime         not null
#  rateable_type :string
#  uscis         :float
#  working_hrs   :float
#  overtime_rate :float
#
require 'test_helper'

class ChangeRateTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
