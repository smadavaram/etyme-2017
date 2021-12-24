# frozen_string_literal: true

# == Schema Information
#
# Table name: consultant_profiles
#
#  id              :integer          not null, primary key
#  consultant_id   :integer
#  designation     :string
#  joining_date    :date
#  location_id     :integer
#  employment_type :integer
#  salary_type     :integer
#  salary          :float
#  created_at      :datetime         not null
#  updated_at      :datetime         not null
#
require 'test_helper'

class ConsultantProfileTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
