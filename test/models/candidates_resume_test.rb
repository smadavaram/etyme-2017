# frozen_string_literal: true

# == Schema Information
#
# Table name: candidates_resumes
#
#  id           :bigint           not null, primary key
#  candidate_id :integer
#  resume       :string
#  is_primary   :boolean          default(FALSE)
#  created_at   :datetime         not null
#  updated_at   :datetime         not null
#
require 'test_helper'

class CandidatesResumeTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
