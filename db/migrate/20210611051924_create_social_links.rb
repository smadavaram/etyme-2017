class CreateSocialLinks < ActiveRecord::Migration[5.1]
  def self.up
    create_table :social_links do |t|
      t.belongs_to :candidate
      t.string :link_name
      t.text :link_value

      t.timestamps
    end
    
    def self.down
      drop_table :social_links
    end  
  end
end
