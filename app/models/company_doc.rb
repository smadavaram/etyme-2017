class CompanyDoc < ActiveRecord::Base

  #Associations
  has_one :attachment , as: :attachable
  belongs_to :company
  belongs_to :user, foreign_key: :created_by
  has_and_belongs_to_many :user_docs,join_table: "user_docs"

  #Validations
  validates_presence_of :name,:company,:created_by, on: :create

  accepts_nested_attributes_for :attachment , reject_if: :all_blank

  acts_as_taggable


end
