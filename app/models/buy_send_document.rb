class BuySendDocument < ApplicationRecord

  belongs_to :buy_contract, optional: true
  belongs_to :creatable      , polymorphic: :true, optional: true
  has_many :document_signs       , as: :documentable

  include NumberGenerator.new({prefix: 'BSD', length: 7})

  accepts_nested_attributes_for :document_signs, allow_destroy: true,reject_if: :all_blank
end
