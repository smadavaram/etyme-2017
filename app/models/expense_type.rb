class ExpenseType < ApplicationRecord

  validates_uniqueness_of :name, :case_sensitive => false

  scope :search_by ,->(term) { Job.where('lower(name) like :term ' ,{term: "#{term.downcase}%" })}
  def self.like_any(fields, values)
    conditions = fields.product(values).map do |(field, value)|
      [arel_table[field].matches("#{value}%"), arel_table[field].matches("% #{value}%")]
    end
    where conditions.flatten.inject(:or)
  end

end
