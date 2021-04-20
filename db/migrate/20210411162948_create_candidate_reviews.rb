class CreateCandidateReviews < ActiveRecord::Migration[5.1]
  def self.up
    create_table :candidate_reviews do |t|
      t.belongs_to :candidate
      t.integer :communication_rating
      t.integer :service_rating
      t.integer :recommend_rating
      t.text :rating_comment
      t.string :reviewer
      
      t.timestamps
    end
  end
  def self.down
    drop_table :candidate_reviews
  end
  
end
