# frozen_string_literal: true

# == Schema Information
#
# Table name: addresses
#
#  id               :integer          not null, primary key
#  address_1        :string
#  address_2        :string
#  country          :string
#  city             :string
#  state            :string
#  zip_code         :string
#  created_at       :datetime         not null
#  updated_at       :datetime         not null
#  from_date        :date
#  to_date          :date
#  addressable_type :string
#  addressable_id   :bigint
#  latitude         :float
#  longitude        :float
#
require 'test_helper'

class AddressTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
