class CreateFreeEmailProviders < ActiveRecord::Migration[5.1]
  def change
    create_table :free_email_providers do |t|
      t.string  :domain_name
      t.boolean :published

      t.timestamps
    end
  end
end
