package app.loxiro.browser;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/** Runs under the separate test APK's UID; simulates a user-granted document provider. */
public final class FixtureDocumentProvider extends ContentProvider {
    @Override public boolean onCreate(){return true;}
    @Override public Bundle call(String method,String arg,Bundle extras){
        if("grant".equals(method)&&"app.loxiro.browser".equals(arg)){
            getContext().grantUriPermission(arg,Uri.parse("content://app.loxiro.browser.test.files/hello.txt"),Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getContext().grantUriPermission(arg,Uri.parse("content://app.loxiro.browser.test.files/photo.png"),Intent.FLAG_GRANT_READ_URI_PERMISSION);
        }
        return Bundle.EMPTY;
    }
    @Override public String getType(Uri uri){return uri.getPath().endsWith(".png")?"image/png":"text/plain";}
    @Override public ParcelFileDescriptor openFile(Uri uri,String mode) throws java.io.FileNotFoundException {
        if(!"r".equals(mode))throw new java.io.FileNotFoundException("Read-only fixture");
        File file=new File(getContext().getCacheDir(),uri.getPath().endsWith(".png")?"photo.png":"hello.txt");
        byte[] data=uri.getPath().endsWith(".png")?android.util.Base64.decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",0):"Selected document fixture".getBytes(StandardCharsets.UTF_8);
        try(FileOutputStream out=new FileOutputStream(file)){out.write(data);}catch(java.io.IOException e){throw new java.io.FileNotFoundException(e.toString());}
        return ParcelFileDescriptor.open(file,ParcelFileDescriptor.MODE_READ_ONLY);
    }
    @Override public Cursor query(Uri uri,String[] projection,String selection,String[] args,String sort){
        String[] columns=projection==null?new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE}:projection;MatrixCursor c=new MatrixCursor(columns);Object[] values=new Object[columns.length];
        for(int i=0;i<columns.length;i++){if(OpenableColumns.DISPLAY_NAME.equals(columns[i]))values[i]=uri.getLastPathSegment();if(OpenableColumns.SIZE.equals(columns[i]))values[i]=uri.getPath().endsWith(".png")?68:25;}
        c.addRow(values);return c;
    }
    @Override public Uri insert(Uri u,ContentValues v){throw new UnsupportedOperationException();}
    @Override public int update(Uri u,ContentValues v,String s,String[] a){throw new UnsupportedOperationException();}
    @Override public int delete(Uri u,String s,String[] a){throw new UnsupportedOperationException();}
}
