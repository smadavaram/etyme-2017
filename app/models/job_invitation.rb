class JobInvitation < ActiveRecord::Base
  belongs_to   :sender , class_name: "User" ,foreign_key: :sender_id
  belongs_to   :receipent , polymorphic: true
  belongs_to :job
  belongs_to :user
end
