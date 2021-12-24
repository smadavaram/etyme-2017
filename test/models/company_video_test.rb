# frozen_string_literal: true

# == Schema Information
#
# Table name: company_videos
#
#  id         :bigint           not null, primary key
#  company_id :integer
#  video      :string
#  video_type :string
#  created_at :datetime         not null
#  updated_at :datetime         not null
#
require 'test_helper'

class CompanyVideoTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
