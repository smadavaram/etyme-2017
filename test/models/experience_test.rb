# frozen_string_literal: true

# == Schema Information
#
# Table name: experiences
#
#  id               :integer          not null, primary key
#  experience_title :string
#  start_date       :date
#  end_date         :date
#  institute        :string
#  status           :integer
#  description      :text
#  user_id          :integer
#  created_at       :datetime         not null
#  updated_at       :datetime         not null
#  industry         :string
#  department       :string
#
require 'test_helper'

class ExperienceTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
