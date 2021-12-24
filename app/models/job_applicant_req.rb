# frozen_string_literal: true

# == Schema Information
#
# Table name: job_applicant_reqs
#
#  id                 :bigint           not null, primary key
#  job_application_id :bigint
#  job_requirement_id :bigint
#  applicant_ans      :text
#  app_multi_ans      :string
#  created_at         :datetime         not null
#  updated_at         :datetime         not null
#
class JobApplicantReq < ApplicationRecord
  belongs_to :job_application
  belongs_to :job_requirement
  serialize :app_multi_ans
end
