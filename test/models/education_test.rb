# frozen_string_literal: true

# == Schema Information
#
# Table name: educations
#
#  id              :integer          not null, primary key
#  degree_title    :string
#  grade           :string
#  completion_year :date
#  start_year      :date
#  institute       :string
#  status          :integer
#  description     :text
#  user_id         :integer
#  created_at      :datetime         not null
#  updated_at      :datetime         not null
#  degree_level    :string
#
require 'test_helper'

class EducationTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
