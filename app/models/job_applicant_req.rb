class JobApplicantReq < ApplicationRecord
  belongs_to :job_application
  serialize :app_multi_ans, Array
end