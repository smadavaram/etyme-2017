class AddNameColumnToCandidateReviews < ActiveRecord::Migration[5.1]
  def self.up
    add_column :candidate_reviews, :name, :string
  end
  def self.down
    remove_column :candidate_reviews, :name
  end  
end
