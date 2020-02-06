# frozen_string_literal: true

class JobApplicantReq < ApplicationRecord
  belongs_to :job_application
  belongs_to :job_requirement
  serialize :app_multi_ans
end
