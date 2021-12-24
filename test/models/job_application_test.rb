# frozen_string_literal: true

# == Schema Information
#
# Table name: job_applications
#
#  id                     :integer          not null, primary key
#  job_invitation_id      :integer
#  cover_letter           :text
#  message                :string
#  status                 :integer          default("applied")
#  created_at             :datetime         not null
#  updated_at             :datetime         not null
#  job_id                 :integer
#  application_type       :integer
#  company_id             :integer
#  applicationable_id     :integer
#  applicationable_type   :string
#  applicant_resume       :string
#  share_key              :string
#  available_from         :string
#  available_to           :string
#  available_to_join      :datetime
#  total_experience       :float
#  relevant_experience    :float
#  rate_per_hour          :float
#  rate_initiator         :string
#  accept_rate            :boolean          default(FALSE)
#  accept_rate_by_company :boolean          default(FALSE)
#  recruiter_company_id   :integer
#
require 'test_helper'

class JobApplicationTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
