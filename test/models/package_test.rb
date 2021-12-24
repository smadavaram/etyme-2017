# frozen_string_literal: true

# == Schema Information
#
# Table name: packages
#
#  id          :integer          not null, primary key
#  name        :string
#  description :text
#  duration    :integer
#  price       :float
#  slug        :string
#  created_at  :datetime         not null
#  updated_at  :datetime         not null
#
require 'test_helper'

class PackageTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
