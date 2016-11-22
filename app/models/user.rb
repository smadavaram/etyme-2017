# == Schema Information
#
# Table name: devise
#
#  id                     :integer          not null, primary key
#  first_name             :string           default("")
#  last_name              :string           default("")
#  gender                 :boolean
#  email                  :string           default(""), not null
#  type                   :string
#  phone                  :string
#  country                :string
#  state                  :string
#  city                   :string
#  zip_code               :string
#  photo                  :string
#  status                 :boolean
#  encrypted_password     :string           default(""), not null
#  reset_password_token   :string
#  reset_password_sent_at :datetime
#  remember_created_at    :datetime
#  sign_in_count          :integer          default(0), not null
#  current_sign_in_at     :datetime
#  last_sign_in_at        :datetime
#  current_sign_in_ip     :string
#  last_sign_in_ip        :string
#  confirmation_token     :string
#  confirmed_at           :datetime
#  confirmation_sent_at   :datetime
#  unconfirmed_email      :string
#  created_at             :datetime         not null
#  updated_at             :datetime         not null
#  company_id             :integer
#
# Indexes
#
#  index_users_on_confirmation_token    (confirmation_token) UNIQUE
#  index_users_on_email                 (email) UNIQUE
#  index_users_on_reset_password_token  (reset_password_token) UNIQUE
#

class User < ActiveRecord::Base
  # Include default devise modules. Others available are:
  # :confirmable, :lockable, :timeoutable and :omniauthable
  devise :invitable, :database_authenticatable, :registerable,
         :recoverable, :rememberable, :trackable

  #Serializers
  # serialize :signature, JSON

  # Validations
  # validates :first_name, :presence => true
  # validates :last_name, :presence => true
  # validates_presence_of :email
  # validates_uniqueness_of :email
  #

  # Association
  belongs_to :company
  belongs_to :address , foreign_key: :primary_address_id
  has_and_belongs_to_many :roles
  has_many :custom_fields, as: :customizable
  has_many :user_docs,dependent: :destroy
  has_and_belongs_to_many :company_docs,join_table: "user_docs"
  has_many :notifications,as: :notifiable


  #Nested Attributes

  #Nested Attributes
  accepts_nested_attributes_for :user_docs , reject_if: :all_blank
  accepts_nested_attributes_for :custom_fields , reject_if: :all_blank



  def full_name
    self.first_name + " " + self.last_name
  end

end
