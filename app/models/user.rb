class User < ActiveRecord::Base
  # Include default devise modules. Others available are:
  # :confirmable, :lockable, :timeoutable and :omniauthable
  devise :database_authenticatable, :registerable,
         :recoverable, :rememberable, :trackable, :validatable

  has_one :company, foreign_key: :owner_id , dependent: :destroy
  has_many :job_invitations , foreign_key: :sender_id , dependent: :destroy
  has_many :jobs
end
