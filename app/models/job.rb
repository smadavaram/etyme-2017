# == Schema Information
#
# Table name: jobs
#
#  id          :integer          not null, primary key
#  title       :string
#  description :text
#  country     :string
#  zip_code    :string
#  state       :string
#  city        :string
#  start_date  :date
#  end_date    :date
#  user_id     :integer
#  created_at  :datetime         not null
#  updated_at  :datetime         not null
#

class Job < ActiveRecord::Base
  belongs_to :user
  has_many :job_invitations
end
