class CreateFavouriteChats < ActiveRecord::Migration[5.1]
  def change
    create_table :favourite_chats do |t|
      t.belongs_to :favourable, polymorphic: true
      t.belongs_to :favourabled, polymorphic: true

      t.timestamps
    end
  end
end
