class CompanyDoc < ActiveRecord::Base

  self.per_page = 15

  has_one :attachment , as: :attachable
  belongs_to :company
  belongs_to :user, foreign_key: :created_by
  has_many :attachable_docs, dependent: :destroy
  has_many :users, through: :attachable_docs, source: :documentable, source_type: 'User'
  has_one  :message
  # has_and_belongs_to_many :users,join_table: :attachable_docs

  validates_presence_of :name,:company,:created_by, on: :create

  accepts_nested_attributes_for :attachment , reject_if: :all_blank

  acts_as_taggable


end
