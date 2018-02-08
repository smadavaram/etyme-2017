class SellRequestDocument < ApplicationRecord

  belongs_to :sell_contract
  belongs_to :creatable      , polymorphic: :true

  has_many :document_signs       , as: :documentable

  include NumberGenerator.new({prefix: 'SRD', length: 7})

  accepts_nested_attributes_for :document_signs, allow_destroy: true,reject_if: :all_blank

end
