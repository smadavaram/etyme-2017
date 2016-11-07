# == Schema Information
#
# Table name: job_invitations
#
#  id             :integer          not null, primary key
#  receipent_id   :integer
#  receipent_type :string
#  sender_id      :integer
#  job_id         :integer
#  status         :integer          default(0)
#  created_at     :datetime         not null
#  updated_at     :datetime         not null
#

class JobInvitation < ActiveRecord::Base
  belongs_to   :sender , class_name: "User" ,foreign_key: :sender_id
  belongs_to   :receipent , polymorphic: true
  belongs_to :job
  belongs_to :user
end
