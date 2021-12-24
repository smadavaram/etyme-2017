# frozen_string_literal: true

# == Schema Information
#
# Table name: locations
#
#  id         :integer          not null, primary key
#  name       :string
#  address_id :integer
#  company_id :integer
#  status     :integer
#  created_at :datetime         not null
#  updated_at :datetime         not null
#
require 'test_helper'

class LocationTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
